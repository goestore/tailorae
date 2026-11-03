package com.tailorae.catalog.rules

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Port of legacy-api/src/utils/category-tree.test.ts. */
class CategoryTreeTest {
    private fun row(id: String, parentId: String?, displayOrder: Int = 0, listingTemplate: String? = null) =
        CategoryRow(id = id, name = id, slug = id, parentId = parentId, displayOrder = displayOrder, listingTemplate = listingTemplate)

    private val rows = listOf(
        row("kids", null, displayOrder = 3),
        row("dresses", "kids"),
        row("footwear", null, displayOrder = 4, listingTemplate = "footwear"),
        row("sneakers", "footwear"),
        row("womens", null, displayOrder = 1),
    )

    @Test
    fun `nests by parent, ordered, with paths and inherited templates`() {
        val tree = CategoryTree.build(rows)
        assertEquals(listOf("womens", "kids", "footwear"), tree.map { it.row.slug })
        val sneakers = CategoryTree.flatten(tree).first { it.row.slug == "sneakers" }
        assertEquals(1, sneakers.depth)
        assertEquals(listOf("footwear", "sneakers"), sneakers.path)
        assertEquals("footwear", sneakers.resolvedTemplate)
    }

    @Test
    fun `resolves a template up the parents`() {
        assertEquals("footwear", CategoryTree.resolveTemplate(rows, "sneakers"))
        assertNull(CategoryTree.resolveTemplate(rows, "dresses"))
    }

    @Test
    fun `refuses a move that would make a loop`() {
        assertTrue(CategoryTree.wouldCreateCycle(rows, "footwear", "sneakers"))
        assertTrue(CategoryTree.wouldCreateCycle(rows, "footwear", "footwear"))
        assertFalse(CategoryTree.wouldCreateCycle(rows, "dresses", "womens"))
        assertFalse(CategoryTree.wouldCreateCycle(rows, "dresses", null))
    }

    @Test
    fun `covers a category and its descendants, and nothing for an unknown one`() {
        assertEquals(listOf("footwear", "sneakers"), CategoryTree.scope(rows, "footwear").sorted())
        assertEquals(emptyList(), CategoryTree.scope(rows, "nope"))
    }

    @Test
    fun `survives a loop written straight into the database`() {
        val looped = listOf(row("a", "b"), row("b", "a"), row("c", null))
        assertEquals(listOf("c"), CategoryTree.flatten(CategoryTree.build(looped)).map { it.row.id })
    }
}
