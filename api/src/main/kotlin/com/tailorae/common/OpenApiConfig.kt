package com.tailorae.common

import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.info.Info
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/** The API description the web app's TypeScript client is generated from (`npm run api:types` in web/). */
@Configuration
class OpenApiConfig {
    @Bean
    fun openApi(): OpenAPI = OpenAPI().info(
        Info().title("TAILORAE API").version("1").description("Storefront, seller and staff API. Money is integer paise; ids are UUIDv7."),
    )

    @Bean
    fun openApiPublicEndpoints() = PublicEndpoints.get("/v3/api-docs", "/v3/api-docs/**")
}
