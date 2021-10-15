import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.111.0/testing/asserts.ts";
import { AsyncMemCache } from "./index.ts";
import { FakeTime } from "https://deno.land/x/mock@0.10.1/mod.ts";

Deno.test("returns promise", async () => {
  const c = new AsyncMemCache<string>(1);

  const f = () => Promise.resolve("ok");

  const result = await c.get("myKey", f);

  assertEquals(result, "ok");
  c.destroy();
});
Deno.test("returns different promises", async () => {
  const c = new AsyncMemCache<string>(1);

  const f = (value: string) => () => Promise.resolve(value);

  assertEquals(await c.get("myKey", f("ok")), "ok");
  assertEquals(await c.get("myKey2", f("ok2")), "ok2");
  c.destroy();
});
Deno.test("will cache", async () => {
  const c = new AsyncMemCache<string>(1000);

  const f = (value: string) => () => Promise.resolve(value);

  assertEquals(await c.get("myKey", f("first")), "first");
  assertEquals(await c.get("myKey", f("second")), "first");
  c.destroy();
});

Deno.test("does not return expired value", async () => {
  const t = new FakeTime("2020-01-01");
  const c = new AsyncMemCache<string>(5);

  try {
    const f = (value: string) => () => Promise.resolve(value);

    assertEquals(await c.get("myKey", f("first")), "first");
    t.tick(10);
    assertEquals(await c.get("myKey", f("second")), "second");
  } finally {
    c.destroy();
    t.restore();
  }
});

Deno.test("clears expired value", async () => {
  const t = new FakeTime("2020-01-01");
  const c = new AsyncMemCache<string>(5);

  try {
    const f = (value: string) => () => Promise.resolve(value);

    await c.get("myKey", f("first"));

    assertEquals(c.length, 1);
    t.tick(5 * AsyncMemCache.INTERVAL_MULTIPLIER + 1);
    assertEquals(c.length, 0);
  } finally {
    c.destroy();
    t.restore();
  }
});

Deno.test("calls getFromSource only once while pending", async () => {
  const c = new AsyncMemCache<string>(5);

  try {
    let calls = 0;
    const f = (value: string) => () =>
      new Promise<string>((resolve, _reject) => {
        calls++;
        setTimeout(() => resolve(value), 1);
      });

    const p1 = c.get("myKey", f("first"));
    const p2 = c.get("myKey", f("second"));
    const val1 = await p1;
    const val2 = await p2;

    assertEquals(val1, "first");
    assertEquals(val2, "first");
    assertEquals(calls, 1);
  } finally {
    c.destroy();
  }
});

Deno.test("handles failure", async () => {
  const c = new AsyncMemCache<string>(5);

  try {
    const f = (value: Error) => () => Promise.reject(value);

    await assertRejects(
      () => c.get("myKey", f(new Error("boom"))),
      Error,
      "boom"
    );
    assertEquals<number>(c.length, 0);
  } finally {
    c.destroy();
  }
});

Deno.test("method shouldCache", async () => {
  const c = new AsyncMemCache<string>(5, (value: string) => !!value);

  try {
    const f = () => Promise.resolve("");

    assertEquals<string>(await c.get("myKey", f), "");
    assertEquals<number>(c.length, 0);
  } finally {
    c.destroy();
  }
});

Deno.test("invalid ttlMs", () => {
  assertThrows(() => new AsyncMemCache(0));
  assertThrows(() => new AsyncMemCache(-1));
});
