package com.tailorae.common

import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.servlet.resource.NoResourceFoundException

/** Maps every failure onto the envelope, with a status the client can branch on. */
@RestControllerAdvice
class ApiExceptionHandler {
    private val log = LoggerFactory.getLogger(javaClass)

    @ExceptionHandler(ApiException::class)
    fun api(e: ApiException) = respond(e.status, e.message ?: e.status.reasonPhrase)

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun invalid(e: MethodArgumentNotValidException): ResponseEntity<ApiResponse<Unit>> {
        val first = e.bindingResult.fieldErrors.firstOrNull()
        val message = first?.let { "${it.field}: ${it.defaultMessage}" } ?: "Invalid request"
        return respond(HttpStatus.BAD_REQUEST, message)
    }

    @ExceptionHandler(HttpMessageNotReadableException::class)
    fun unreadable(e: HttpMessageNotReadableException) = respond(HttpStatus.BAD_REQUEST, "Malformed request body")

    @ExceptionHandler(DataIntegrityViolationException::class)
    fun conflict(e: DataIntegrityViolationException) = respond(HttpStatus.CONFLICT, "That already exists")

    @ExceptionHandler(NoResourceFoundException::class)
    fun notFound(e: NoResourceFoundException) = respond(HttpStatus.NOT_FOUND, "Route not found")

    @ExceptionHandler(Exception::class)
    fun unexpected(e: Exception): ResponseEntity<ApiResponse<Unit>> {
        log.error("Unhandled error", e)
        return respond(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong on our side")
    }

    private fun respond(status: HttpStatus, message: String) =
        ResponseEntity.status(status).body(ApiResponse.fail(message))
}
