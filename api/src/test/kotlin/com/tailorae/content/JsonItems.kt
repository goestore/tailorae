package com.tailorae.content

import tools.jackson.databind.JsonNode

/** The elements of a JSON array in a test response. */
fun JsonNode.items(): List<JsonNode> = (0 until size()).map { get(it) }
