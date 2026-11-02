import assert from "node:assert/strict";
import { test } from "node:test";

import { safelyResolvePermissionSpecs } from "../src/plugins/permissionsViewer/safeSpecMap";

test("Discord permission spec lookup can fail without crashing permission display", () => {
    assert.deepEqual(safelyResolvePermissionSpecs(() => { throw new TypeError("Cannot read properties of undefined (reading 'length')"); }), {});
    assert.deepEqual(safelyResolvePermissionSpecs(() => undefined), {});
});
test("normal permission metadata remains available", () => {
    const data = { "1": { title: "View Channels" } };
    assert.equal(safelyResolvePermissionSpecs(() => data), data);
});
