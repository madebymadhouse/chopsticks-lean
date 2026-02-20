// test/unit/prefix-parity.test.js
import { describe, it, after } from "mocha";
import assert from "assert";
import { checkMetaPerms, clearMetaCache } from "../../src/prefix/applyMetaPerms.js";
import { PermissionFlagsBits } from "discord.js";

describe("Prefix Parity — applyMetaPerms", () => {
  after(() => clearMetaCache());

  function makeMember(perms) {
    return {
      permissions: {
        has: (p) => perms.includes(p),
      },
    };
  }

  function makeMessage({ guildId = "123", member = null, guild = true } = {}) {
    return {
      guild: guild ? { id: guildId } : null,
      member: member,
    };
  }

  it("allows command with no userPerms", async () => {
    // ping has no userPerms
    const result = await checkMetaPerms(makeMessage({ member: makeMember([]) }), "ping");
    assert.strictEqual(result.ok, true);
  });

  it("blocks guild-only command in DM", async () => {
    const result = await checkMetaPerms(makeMessage({ guild: false }), "ban");
    assert.strictEqual(result.ok, false);
    assert.ok(result.reason.includes("server"));
  });

  it("allows user with correct permission", async () => {
    const msg = makeMessage({ member: makeMember([PermissionFlagsBits.BanMembers]) });
    const result = await checkMetaPerms(msg, "ban");
    assert.strictEqual(result.ok, true);
  });

  it("blocks user missing required permission", async () => {
    const msg = makeMessage({ member: makeMember([]) });
    const result = await checkMetaPerms(msg, "ban");
    assert.strictEqual(result.ok, false);
    assert.ok(result.missingPerms.length > 0);
  });

  it("caches meta on second call (no re-import)", async () => {
    const msg = makeMessage({ member: makeMember([PermissionFlagsBits.BanMembers]) });
    await checkMetaPerms(msg, "kick"); // prime cache
    const result = await checkMetaPerms(msg, "kick");
    assert.strictEqual(result.ok, false); // kick needs KickMembers not BanMembers
  });

  it("allows command for nonexistent command file (graceful)", async () => {
    const msg = makeMessage({ member: makeMember([]) });
    const result = await checkMetaPerms(msg, "nonexistent-command-xyz");
    assert.strictEqual(result.ok, true); // no meta = no restriction
  });
});
