package com.tailorae.catalog.rules

/**
 * The category tree, in memory.
 *
 * Categories are a parent/child table of a few dozen rows, so every question
 * about the tree (which listing template applies, which categories a page
 * covers, would this move make a loop) is answered by reading the whole table
 * once and walking it here, rather than by recursive SQL.
 */
data class CategoryRow(
    val id: String,
    val name: String,
    val slug: String,
    val parentId: String?,
    val displayOrder: Int = 0,
    val isActive: Boolean = true,
    val image: String? = null,
    val description: String? = null,
    val listingTemplate: String? = null,
    val commissionRateBp: Int? = null,
    val showOnHome: Boolean = false,
    val homeOrder: Int = 0,
)

data class CategoryNode(
    val row: CategoryRow,
    val depth: Int,
    /** Own template, else the nearest ancestor's. */
    val resolvedTemplate: String?,
    /** Slugs from the root down to this category, for /c/<path> URLs. */
    val path: List<String>,
    val children: List<CategoryNode>,
)

object CategoryTree {
    /** Display order, then name — locale-ish, case-insensitive first. */
    val byOrder: Comparator<CategoryRow> =
        compareBy<CategoryRow> { it.displayOrder }.thenBy(String.CASE_INSENSITIVE_ORDER) { it.name }.thenBy { it.name }

    /**
     * Nest flat rows. A row whose parent is missing becomes a root rather than
     * vanishing, and a row caught in a loop written by hand in the database is
     * dropped instead of recursing forever.
     */
    fun build(rows: List<CategoryRow>): List<CategoryNode> {
        val ids = rows.map { it.id }.toSet()
        val childrenOf = LinkedHashMap<String?, MutableList<CategoryRow>>()
        for (row in rows) {
            val parent = row.parentId?.takeIf { it in ids }
            childrenOf.getOrPut(parent) { mutableListOf() } += row
        }
        val seen = mutableSetOf<String>()
        fun node(row: CategoryRow, depth: Int, inherited: String?, path: List<String>): CategoryNode {
            seen += row.id
            val resolved = row.listingTemplate ?: inherited
            val own = path + row.slug
            val children = (childrenOf[row.id] ?: emptyList())
                .filter { it.id !in seen }
                .sortedWith(byOrder)
                .map { node(it, depth + 1, resolved, own) }
            return CategoryNode(row, depth, resolved, own, children)
        }
        return (childrenOf[null] ?: emptyList()).sortedWith(byOrder).map { node(it, 0, null, emptyList()) }
    }

    /** Depth-first, parents before children: the order a nested picker lists them. */
    fun flatten(nodes: List<CategoryNode>): List<CategoryNode> = nodes.flatMap { listOf(it) + flatten(it.children) }

    /** The category's id and every id below it. */
    fun descendantIds(rows: List<CategoryRow>, rootId: String): List<String> {
        val out = mutableListOf(rootId)
        var i = 0
        while (i < out.size) {
            for (row in rows) if (row.parentId == out[i] && row.id !in out) out += row.id
            i++
        }
        return out
    }

    /** True when making [parentId] the parent of [id] would put [id] inside itself. */
    fun wouldCreateCycle(rows: List<CategoryRow>, id: String, parentId: String?): Boolean {
        if (parentId.isNullOrEmpty()) return false
        return parentId in descendantIds(rows, id)
    }

    /** The nearest template on the way up from this category, or null. */
    fun resolveTemplate(rows: List<CategoryRow>, id: String?): String? {
        val byId = rows.associateBy { it.id }
        val visited = mutableSetOf<String>()
        var current = id?.let { byId[it] }
        while (current != null && current.id !in visited) {
            current.listingTemplate?.let { if (it.isNotEmpty()) return it }
            visited += current.id
            current = current.parentId?.let { byId[it] }
        }
        return null
    }

    /**
     * The ids a `?category=` value covers: the category matched by slug or id,
     * and everything nested under it. An unknown value covers nothing.
     */
    fun scope(rows: List<CategoryRow>, slugOrId: String): List<String> {
        val root = rows.firstOrNull { it.slug == slugOrId || it.id == slugOrId } ?: return emptyList()
        return descendantIds(rows, root.id)
    }
}
