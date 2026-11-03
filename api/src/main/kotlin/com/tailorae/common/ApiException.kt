package com.tailorae.common

import org.springframework.http.HttpStatus

/**
 * A failure the caller can act on. The message is shown to the user as-is,
 * so it must never carry internals.
 */
open class ApiException(val status: HttpStatus, message: String) : RuntimeException(message)

class NotFoundException(message: String = "Not found") : ApiException(HttpStatus.NOT_FOUND, message)

class ConflictException(message: String) : ApiException(HttpStatus.CONFLICT, message)

class UnauthorizedException(message: String = "Please sign in") : ApiException(HttpStatus.UNAUTHORIZED, message)

class BadRequestException(message: String) : ApiException(HttpStatus.BAD_REQUEST, message)
