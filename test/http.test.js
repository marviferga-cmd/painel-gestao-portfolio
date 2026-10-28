import { test } from "node:test";
import assert from "node:assert/strict";
import { idParam, isUuid, uuidOuNull } from "../src/lib/http.js";
import { ValidationError } from "../src/lib/format.js";

const ID = "0b9d6f3e-1c2a-4e5f-8a7b-6c5d4e3f2a1b";

test("isUuid aceita só UUID", () => {
  assert.ok(isUuid(ID));
  assert.ok(isUuid(ID.toUpperCase()));
  for (const v of ["123", 123, "", null, undefined, `${ID}x`, "0b9d6f3e1c2a4e5f8a7b6c5d4e3f2a1b"]) assert.equal(isUuid(v), false, String(v));
});

test("idParam devolve o UUID em minúsculas e recusa ids antigos", () => {
  assert.equal(idParam({ params: { id: ID.toUpperCase() } }), ID);
  assert.throws(() => idParam({ params: { id: "42" } }), ValidationError);
});

test("uuidOuNull: vazio vira null, inválido é recusado", () => {
  assert.equal(uuidOuNull("", "X"), null);
  assert.equal(uuidOuNull(null, "X"), null);
  assert.equal(uuidOuNull(ID, "X"), ID);
  assert.throws(() => uuidOuNull("abc", "Cliente"), /Cliente: identificador inválido/);
});
