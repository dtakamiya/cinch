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

  it("#/benchmark はベンチマーク", () => {
    expect(parseRoute("#/benchmark")).toEqual({ name: "benchmark" });
    expect(parseRoute("/benchmark")).toEqual({ name: "benchmark" });
  });

  it("余分なセグメントがある benchmark パスは一覧扱い", () => {
    expect(parseRoute("#/benchmark/x")).toEqual({ name: "list" });
  });

  it("#/?project=<name> は project 付きの一覧", () => {
    expect(parseRoute("#/?project=cinch")).toEqual({
      name: "list",
      project: "cinch",
    });
  });

  it("project の値は decodeURIComponent する", () => {
    expect(parseRoute("#/?project=my%2Fproj%20x")).toEqual({
      name: "list",
      project: "my/proj x",
    });
  });

  it("project= が空なら素の一覧扱い（project キー無し）", () => {
    expect(parseRoute("#/?project=")).toEqual({ name: "list" });
  });

  it("他のクエリキーが混ざっていても project だけ拾う", () => {
    expect(parseRoute("#/?foo=1&project=cinch&bar=2")).toEqual({
      name: "list",
      project: "cinch",
    });
  });

  it("project デコード失敗時はそのまま返す", () => {
    expect(parseRoute("#/?project=%E0%A4%A")).toEqual({
      name: "list",
      project: "%E0%A4%A",
    });
  });
});

describe("routeToHash", () => {
  it("一覧は #/", () => {
    expect(routeToHash({ name: "list" })).toBe("#/");
  });

  it("project 未指定・空文字の一覧は #/", () => {
    expect(routeToHash({ name: "list", project: "" })).toBe("#/");
  });

  it("project 付き一覧は #/?project=<encodeURIComponent(name)>", () => {
    expect(routeToHash({ name: "list", project: "my/proj x" })).toBe(
      "#/?project=my%2Fproj%20x",
    );
  });

  it("詳細は #/session/<encodeURIComponent(id)>", () => {
    expect(routeToHash({ name: "detail", sessionId: "a/b c" })).toBe(
      "#/session/a%2Fb%20c",
    );
  });

  it("ベンチマークは #/benchmark", () => {
    expect(routeToHash({ name: "benchmark" })).toBe("#/benchmark");
  });

  it("parseRoute と routeToHash は往復する", () => {
    for (const hash of ["#/", "#/benchmark", "#/?project=cinch", "#/session/s1"]) {
      expect(routeToHash(parseRoute(hash))).toBe(hash);
    }
  });
});
