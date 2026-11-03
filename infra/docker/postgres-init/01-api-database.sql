-- The Kotlin API has its own database (Flyway owns its schema). Runs only when
-- the Postgres volume is first created.
create database tailorae_api;
