# Protocol boundary

All wire shapes are Effect Schemas with an explicit `v` field. Additive changes still require compatibility reasoning; breaking changes require a new version. Export decoders/encoders so callers do not parse arbitrary JSON themselves.
