# syntax=docker/dockerfile:1

ARG RUST_VERSION=1.99
ARG DEBIAN_SUITE=trixie

FROM rust:${RUST_VERSION}-slim-${DEBIAN_SUITE} AS chef
RUN cargo install cargo-chef --locked
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY . .
RUN touch .env.deploy
RUN cargo build --release --locked --bin hangmu-backend

FROM debian:${DEBIAN_SUITE}-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --no-create-home hangmu
WORKDIR /app
COPY --from=builder /app/target/release/hangmu-backend /usr/local/bin/hangmu-backend
COPY --from=builder /app/.env.deploy /app/.env

EXPOSE 8080
USER hangmu
ENTRYPOINT ["hangmu-backend"]
CMD ["serve"]
