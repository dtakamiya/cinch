import { describe, expect, it } from "vitest";
import { parseRoute, routeToHash } from "./route.js";

describe("parseRoute", () => {
  it("空文字列は一覧", () => {
    expect(parseRoute("")).toEqual({ name: "list" });
  });

  it("#/ は一覧", () => {
    expect(parseRoute("#/")).toEqual({ name: "list" });
  });

  it("# だけは一覧", () => {
    expect(parseRoute("#")).toEqual({ name: "list" });
  });

  it("不明な hash は一覧", () => {
    expect(parseRoute("#/unknown/path")).toEqual({ name: "list" });
    expect(parseRoute("#/session")).toEqual({ name: "list" });
    expect(parseRoute("#/session/")).toEqual({ name: "list" });
  });

  it("#/session/<id> は詳細", () => {
    expect(parseRoute("#/session/abc")).toEqual({
      name: "detail",
      sessionId: "abc",
    });
  });

  it("先頭に # が無くても解釈する", () => {
    expect(parseRoute("/session/abc")).toEqual({
      name: "detail",
      sessionId: "abc",
    });
  });

  it("sessionId は decodeURIComponent する", () => {
    expect(parseRoute("#/session/a%2Fb%20c")).toEqual({
      name: "detail",
      sessionId: "a/b c",
    });
  });

  it("デコードに失敗する id はそのまま返す", () => {
    expect(parseRoute("#/session/%E0%A4%A")).toEqual({
      name: "detail",
      sessionId: "%E0%A4%A",
    });
  });

  it("余分なセグメントがある session パスは一覧扱い", () => {
    expect(parseRoute("#/session/abc/extra")).toEqual({ name: "list" });
  });
});

describe("routeToHash", () => {
  it("一覧は #/", () => {
    expect(routeToHash({ name: "list" })).toBe("#/");
  });

  it("詳細は #/session/<encodeURIComponent(id)>", () => {
    expect(routeToHash({ name: "detail", sessionId: "a/b c" })).toBe(
      "#/session/a%2Fb%20c",
    );
  });
});
