package com.tailorae.catalog

import com.tailorae.catalog.rules.CategoryExtras
import com.tailorae.catalog.rules.CategoryFields
import com.tailorae.catalog.rules.CategoryNode
import com.tailorae.catalog.rules.CategoryRow
import com.tailorae.catalog.rules.CategoryTree
import com.tailorae.catalog.rules.FieldCategory
import com.tailorae.catalog.rules.FieldRow
import com.tailorae.catalog.rules.FieldType
import com.tailorae.catalog.rules.ProductSpec
import com.tailorae.catalog.rules.SpecColumn
import com.tailorae.common.Audit
import com.tailorae.common.BadRequestException
import com.tailorae.common.ConflictException
import com.tailorae.common.Ids
import com.tailorae.common.NotFoundException
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.simple.JdbcClient
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.ResultSet
import java.util.UUID

/**
 * The category tree: staff edit it, the storefront nav and the listing form
 * read it, and product writes read each category's admin-defined fields.
 *
 * The table is a few dozen rows, so every tree question loads it whole and
 * answers it with [CategoryTree] / [CategoryFields] rather than recursive SQL.
 */
@Service
class CategoryService(private val jdbc: JdbcClient, private val audit: Audit) {

    // ------------------------------------------------------------ reads used across the module

    internal fun rows(): List<CategoryRow> =
        jdbc.sql("select * from category").query { rs, _ -> categoryRow(rs) }.list()

    internal fun fieldCategories(): List<FieldCategory> {
        val fields = jdbc.sql("select * from category_field").query { rs, _ -> fieldRow(rs) }.list().groupBy { it.categoryId }
        return jdbc.sql("select id, name, parent_id, option_label, option_values from category").query { rs, _ ->
            val id = rs.getString("id")
            FieldCategory(id, rs.getString("name"), rs.getString("parent_id"), rs.getString("option_label"),
                stringArray(rs, "option_values"), fields[id] ?: emptyList())
        }.list()
    }

    /** What a product in this category gets on top of its template. */
    internal fun extras(categoryId: String?): CategoryExtras =
        if (categoryId.isNullOrBlank()) CategoryExtras.EMPTY else CategoryFields.extrasFor(fieldCategories(), categoryId)

    internal fun columns(categoryId: String?): List<SpecColumn> = extras(categoryId).columns

    internal fun exists(id: String): Boolean =
        runCatching { UUID.fromString(id) }.getOrNull()?.let { uuid ->
            jdbc.sql("select exists (select 1 from category where id = :id)").param("id", uuid).query(Boolean::class.javaObjectType).single()
        } ?: false

    /** Personalisation is a clothing service: own article type decides, else the category's template. */
    internal fun isClothing(articleType: String?, categoryId: String?): Boolean {
        val own = com.tailorae.catalog.rules.Catalogue.find(articleType)
        if (own != null) return own.family == "apparel"
        if (categoryId.isNullOrBlank()) return false
        return com.tailorae.catalog.rules.Catalogue.find(CategoryTree.resolveTemplate(rows(), categoryId))?.family == "apparel"
    }

    // ------------------------------------------------------------ storefront

    @Transactional(readOnly = true)
    fun publicTree(): List<Map<String, Any?>> =
        CategoryTree.build(rows()).filter { it.row.isActive }.map(::publicNode)

    /** Categories with something live to sell, A–Z. */
    @Transactional(readOnly = true)
    fun withLiveProducts(): List<Map<String, Any?>> =
        jdbc.sql(
            """
            select c.id, c.name, c.slug from category c
            where c.is_active and exists (
                select 1 from product p join seller s on s.id = p.seller_id
                where p.category_id = c.id and p.status = 'ACTIVE' and p.moderation_status = 'APPROVED' and s.status = 'APPROVED')
            order by c.name
            """.trimIndent(),
        ).query { rs, _ -> mapOf("id" to rs.getString("id"), "name" to rs.getString("name"), "slug" to rs.getString("slug")) }.list()

    @Transactional(readOnly = true)
    fun home(): List<Map<String, Any?>> {
        fun visible(nodes: List<CategoryNode>): List<CategoryNode> = nodes.filter { it.row.isActive }.flatMap { listOf(it) + visible(it.children) }
        return visible(CategoryTree.build(rows()))
            .filter { it.row.showOnHome }
            .sortedWith(compareBy<CategoryNode> { it.row.homeOrder }.thenBy { it.row.name.lowercase() })
            .map { mapOf("id" to it.row.id, "name" to it.row.name, "slug" to it.row.slug, "image" to it.row.image, "homeOrder" to it.row.homeOrder, "path" to it.path) }
    }

    private fun publicNode(node: CategoryNode): Map<String, Any?> {
        val info = ProductSpec.templateInfo(node.resolvedTemplate)
        return linkedMapOf(
            "id" to node.row.id, "name" to node.row.name, "slug" to node.row.slug, "description" to node.row.description,
            "image" to node.row.image, "displayOrder" to node.row.displayOrder, "path" to node.path,
            "listingTemplate" to info?.slug, "family" to info?.family, "optionLabel" to info?.optionLabel,
            "children" to node.children.filter { it.row.isActive }.map(::publicNode),
        )
    }

    // ------------------------------------------------------------ staff: categories

    @Transactional(readOnly = true)
    fun adminList(): List<Map<String, Any?>> {
        val counts = jdbc.sql(
            """
            select c.id, (select count(*) from product p where p.category_id = c.id) as products,
                   (select count(*) from category k where k.parent_id = c.id) as children
            from category c
            """.trimIndent(),
        ).query { rs, _ -> rs.getString("id") to mapOf("products" to rs.getLong("products"), "children" to rs.getLong("children")) }.list().toMap()
        val raw = jdbc.sql("select * from category").query { rs, _ -> rs.getString("id") to adminView(rs) }.list().toMap()
        return CategoryTree.flatten(CategoryTree.build(raw.values.map { it.second })).map { node ->
            val template = ProductSpec.templateInfo(node.resolvedTemplate)
            raw.getValue(node.row.id).first + mapOf(
                "depth" to node.depth, "path" to node.path, "resolvedTemplate" to template?.slug, "family" to template?.family,
                "_count" to (counts[node.row.id] ?: mapOf("products" to 0L, "children" to 0L)),
            )
        }
    }

    @Transactional
    fun create(adminId: UUID, body: Map<String, Any?>): Map<String, Any?> {
        val picked = ProductInput.pickCategory(body, partial = false)
        if (picked.errors.isNotEmpty()) throw BadRequestException(picked.errors.joinToString(". "))
        checkParent(null, picked.data["parentId"] as String?)
        val id = Ids.newId()
        write(id, picked.data, insert = true)
        audit.record("admin", adminId, "CREATE", "category", id.toString(), after = picked.data)
        return adminCategory(id)
    }

    @Transactional
    fun update(adminId: UUID, id: UUID, body: Map<String, Any?>): Map<String, Any?> {
        val before = adminCategoryOrNull(id) ?: throw NotFoundException("Category not found")
        val picked = ProductInput.pickCategory(body, partial = true)
        if (picked.errors.isNotEmpty()) throw BadRequestException(picked.errors.joinToString(". "))
        if (picked.data.isEmpty()) throw BadRequestException("No valid fields provided to update")
        if (picked.data.containsKey("parentId")) checkParent(id.toString(), picked.data["parentId"] as String?)
        write(id, picked.data, insert = false)
        audit.record("admin", adminId, "UPDATE", "category", id.toString(), before = before, after = picked.data)
        return adminCategory(id)
    }

    @Transactional
    fun delete(adminId: UUID, id: UUID): String {
        val category = adminCategoryOrNull(id) ?: throw NotFoundException("Category not found")
        val products = jdbc.sql("select count(*) from product where category_id = :id").param("id", id).query(Long::class.javaObjectType).single()
        val children = jdbc.sql("select count(*) from category where parent_id = :id").param("id", id).query(Long::class.javaObjectType).single()
        val name = category["name"] as String
        if (products > 0 || children > 0) {
            throw ConflictException("$name still has $products product(s) and $children subcategor${if (children == 1L) "y" else "ies"}. Move them or hide the category instead.")
        }
        jdbc.sql("delete from category where id = :id").param("id", id).update()
        audit.record("admin", adminId, "DELETE", "category", id.toString(), before = category)
        return name
    }

    /** True when the body would change commission, which needs FINANCE as well. */
    fun touchesCommission(body: Map<String, Any?>) = body.containsKey("commissionRateBp")

    private fun checkParent(id: String?, parentId: String?) {
        if (parentId == null) return
        val rows = rows()
        if (rows.none { it.id == parentId }) throw BadRequestException("parentId does not match an existing category")
        if (id != null && CategoryTree.wouldCreateCycle(rows, id, parentId)) {
            throw BadRequestException("A category cannot sit inside itself or one of its own subcategories")
        }
    }

    private val categoryColumns = mapOf(
        "name" to "name", "slug" to "slug", "description" to "description", "image" to "image", "icon" to "icon",
        "parentId" to "parent_id", "displayOrder" to "display_order", "homeOrder" to "home_order", "isActive" to "is_active",
        "showOnHome" to "show_on_home", "listingTemplate" to "listing_template", "commissionRateBp" to "commission_rate_bp",
        "optionLabel" to "option_label", "optionValues" to "option_values",
    )

    private fun write(id: UUID, data: Map<String, Any?>, insert: Boolean) {
        val keys = data.keys.filter { it in categoryColumns }
        fun placeholder(k: String) = when (k) {
            "optionValues" -> "cast(:$k as text[])"
            "parentId" -> "cast(:$k as uuid)"
            else -> ":$k"
        }
        val sql = if (insert) {
            "insert into category (id, ${keys.joinToString(", ") { categoryColumns.getValue(it) }}) values (:id, ${keys.joinToString(", ") { placeholder(it) }})"
        } else {
            "update category set ${keys.joinToString(", ") { "${categoryColumns.getValue(it)} = ${placeholder(it)}" }}, updated_at = now() where id = :id"
        }
        var spec = jdbc.sql(sql).param("id", id)
        for (k in keys) {
            val v = data[k]
            spec = spec.param(k, if (k == "optionValues") ((v as? List<*>) ?: emptyList<Any?>()).map { it.toString() }.toTypedArray() else v)
        }
        try {
            spec.update()
        } catch (e: DuplicateKeyException) {
            throw ConflictException("That slug is taken, or the parent already has a category with this name")
        }
    }

    private fun adminCategoryOrNull(id: UUID): Map<String, Any?>? =
        jdbc.sql("select * from category where id = :id").param("id", id).query { rs, _ -> adminView(rs).first }.optional().orElse(null)

    private fun adminCategory(id: UUID) = adminCategoryOrNull(id) ?: throw NotFoundException("Category not found")

    private fun adminView(rs: ResultSet): Pair<Map<String, Any?>, CategoryRow> {
        val row = categoryRow(rs)
        val view = linkedMapOf<String, Any?>(
            "id" to row.id, "parentId" to row.parentId, "name" to row.name, "slug" to row.slug, "description" to row.description,
            "icon" to rs.getString("icon"), "image" to row.image, "isActive" to row.isActive, "displayOrder" to row.displayOrder,
            "listingTemplate" to row.listingTemplate, "commissionRateBp" to row.commissionRateBp,
            "optionLabel" to rs.getString("option_label"), "optionValues" to stringArray(rs, "option_values"),
            "showOnHome" to row.showOnHome, "homeOrder" to row.homeOrder,
            "createdAt" to rs.getTimestamp("created_at").toInstant(), "updatedAt" to rs.getTimestamp("updated_at").toInstant(),
        )
        return view to row
    }

    // ------------------------------------------------------------ staff: category fields

    @Transactional(readOnly = true)
    fun describeFields(categoryId: UUID): Map<String, Any?> {
        val rows = fieldCategories()
        if (rows.none { it.id == categoryId.toString() }) throw NotFoundException("Category not found")
        return describe(rows, categoryId.toString())
    }

    private fun describe(rows: List<FieldCategory>, id: String): Map<String, Any?> {
        val chain = CategoryFields.ancestorChain(rows, id)
        val self = chain.last()
        val merged = CategoryFields.mergeFields(chain)
        val template = ProductSpec.articleSpec(CategoryTree.resolveTemplate(rows(), id) ?: "general")
        return linkedMapOf(
            "category" to mapOf("id" to self.id, "name" to self.name, "optionLabel" to self.optionLabel, "optionValues" to self.optionValues),
            "fields" to self.fields.sortedWith(compareBy<FieldRow> { it.displayOrder }.thenBy { it.label.lowercase() }).map(::fieldView),
            "inherited" to merged.filter { it.inherited }.map { fieldView(it.field) + mapOf("definedBy" to it.definedBy, "inherited" to true) },
            "inheritedOption" to CategoryFields.mergeOption(chain.dropLast(1)),
            "template" to template?.let { t ->
                mapOf("slug" to t.slug, "articleType" to t.articleType, "family" to t.family, "optionLabel" to t.optionLabel,
                    "attributes" to t.columns.filter { it.scope == "attribute" }.map { mapOf("key" to it.key, "label" to it.label) })
            },
        )
    }

    private fun keyClash(rows: List<FieldCategory>, categoryId: String, key: String, ignoreFieldId: String? = null): String? {
        val related = CategoryFields.relatedCategoryIds(rows, categoryId, { it.id }, { it.parentId }).toSet()
        for (row in rows) {
            if (row.id !in related) continue
            val field = row.fields.firstOrNull { it.key == key && it.id != ignoreFieldId } ?: continue
            return if (row.id == categoryId) "This category already has a field with the key $key"
            else "${row.name} already defines a field with the key $key (“${field.label}”), and products here would see both"
        }
        return null
    }

    @Transactional
    fun createField(adminId: UUID, categoryId: UUID, body: Map<String, Any?>): Map<String, Any?> {
        val rows = fieldCategories()
        val category = rows.firstOrNull { it.id == categoryId.toString() } ?: throw NotFoundException("Category not found")
        val picked = CategoryFields.pickFieldInput(body, null)
        (picked.data["key"] as String?)?.let { key -> keyClash(rows, category.id, key)?.let { picked.errors += it } }
        if (picked.errors.isNotEmpty()) throw BadRequestException(picked.errors.joinToString(". "))
        if (category.fields.size >= 60) throw BadRequestException("A category can have at most 60 fields")
        val id = Ids.newId()
        val d = picked.data
        jdbc.sql(
            """
            insert into category_field (id, category_id, key, label, type, options, unit, help_text, required, filterable, display_order)
            values (:id, :c, :key, :label, :type, cast(:options as text[]), :unit, :help, :required, :filterable, :order)
            """.trimIndent(),
        )
            .param("id", id).param("c", categoryId).param("key", d["key"]).param("label", d["label"])
            .param("type", d["type"] ?: "TEXT").param("options", ((d["options"] as? List<*>) ?: emptyList<Any?>()).map { it.toString() }.toTypedArray())
            .param("unit", d["unit"]).param("help", d["helpText"]).param("required", d["required"] ?: false)
            .param("filterable", d["filterable"] ?: false)
            .param("order", (d["displayOrder"] as Int?) ?: ((category.fields.maxOfOrNull { it.displayOrder } ?: -1) + 1))
            .update()
        audit.record("admin", adminId, "CREATE", "category_field", id.toString(), after = d)
        return field(categoryId, id)
    }

    @Transactional
    fun updateField(adminId: UUID, categoryId: UUID, fieldId: UUID, body: Map<String, Any?>): Map<String, Any?> {
        val current = field(categoryId, fieldId)
        val picked = CategoryFields.pickFieldInput(body, current)
        if (picked.errors.isNotEmpty()) throw BadRequestException(picked.errors.joinToString(". "))
        val columns = mapOf("label" to "label", "type" to "type", "options" to "options", "unit" to "unit", "helpText" to "help_text",
            "required" to "required", "filterable" to "filterable", "displayOrder" to "display_order")
        val keys = picked.data.keys.filter { it in columns }
        if (keys.isNotEmpty()) {
            var spec = jdbc.sql("update category_field set ${keys.joinToString(", ") { k -> "${columns.getValue(k)} = ${if (k == "options") "cast(:$k as text[])" else ":$k"}" }}, updated_at = now() where id = :id")
                .param("id", fieldId)
            for (k in keys) {
                val v = picked.data[k]
                spec = spec.param(k, if (k == "options") ((v as? List<*>) ?: emptyList<Any?>()).map { it.toString() }.toTypedArray() else v)
            }
            spec.update()
        }
        audit.record("admin", adminId, "UPDATE", "category_field", fieldId.toString(), before = current, after = picked.data)
        return field(categoryId, fieldId)
    }

    @Transactional
    fun reorderFields(adminId: UUID, categoryId: UUID, ids: Any?) {
        if (ids !is List<*> || ids.any { it !is String }) throw BadRequestException("ids must be the field ids in their new order")
        val own = jdbc.sql("select id from category_field where category_id = :c").param("c", categoryId).query(String::class.java).list().toSet()
        if (ids.size != own.size || !ids.all { it in own } || ids.toSet().size != ids.size) {
            throw BadRequestException("ids must list every one of this category's fields once")
        }
        ids.forEachIndexed { index, id ->
            jdbc.sql("update category_field set display_order = :o, updated_at = now() where id = :id")
                .param("o", index).param("id", UUID.fromString(id as String)).update()
        }
        audit.record("admin", adminId, "REORDER", "category_field", categoryId.toString(), after = ids)
    }

    @Transactional
    fun deleteField(adminId: UUID, categoryId: UUID, fieldId: UUID) {
        val n = jdbc.sql("delete from category_field where id = :id and category_id = :c").param("id", fieldId).param("c", categoryId).update()
        if (n == 0) throw NotFoundException("Field not found")
        audit.record("admin", adminId, "DELETE", "category_field", fieldId.toString())
    }

    private fun field(categoryId: UUID, fieldId: UUID): Map<String, Any?> =
        jdbc.sql("select * from category_field where id = :id and category_id = :c").param("id", fieldId).param("c", categoryId)
            .query { rs, _ -> fieldView(fieldRow(rs)) }.optional().orElseThrow { NotFoundException("Field not found") }

    private fun fieldView(f: FieldRow): Map<String, Any?> = linkedMapOf(
        "id" to f.id, "categoryId" to f.categoryId, "key" to f.key, "label" to f.label, "type" to f.type.name,
        "options" to f.options, "unit" to f.unit, "helpText" to f.helpText, "required" to f.required,
        "filterable" to f.filterable, "displayOrder" to f.displayOrder,
    )

    // ------------------------------------------------------------ mapping

    private fun categoryRow(rs: ResultSet) = CategoryRow(
        id = rs.getString("id"), name = rs.getString("name"), slug = rs.getString("slug"), parentId = rs.getString("parent_id"),
        displayOrder = rs.getInt("display_order"), isActive = rs.getBoolean("is_active"), image = rs.getString("image"),
        description = rs.getString("description"), listingTemplate = rs.getString("listing_template"),
        commissionRateBp = rs.getObject("commission_rate_bp") as Int?, showOnHome = rs.getBoolean("show_on_home"),
        homeOrder = rs.getInt("home_order"),
    )

    private fun fieldRow(rs: ResultSet) = FieldRow(
        id = rs.getString("id"), categoryId = rs.getString("category_id"), key = rs.getString("key"), label = rs.getString("label"),
        type = FieldType.valueOf(rs.getString("type")), options = stringArray(rs, "options"), unit = rs.getString("unit"),
        helpText = rs.getString("help_text"), required = rs.getBoolean("required"), filterable = rs.getBoolean("filterable"),
        displayOrder = rs.getInt("display_order"),
    )

    private fun stringArray(rs: ResultSet, column: String): List<String> =
        (rs.getArray(column)?.array as? Array<*>)?.map { it.toString() } ?: emptyList()
}
