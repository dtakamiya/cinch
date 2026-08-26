import { afterEach, describe, expect, it, vi } from "vitest";
import { handleListenError } from "./listenError.js";

// 本物の process.exit は戻ってこないが、テストでは戻ってしまうと
// その後の throw まで実行されてしまう。sentinel を投げて中断を再現する。
class ExitCalled extends Error {
  constructor(public code?: number) {
    super(`process.exit(${code})`);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

function stub() {
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new ExitCalled(code as number | undefined);
  });
  return { err, exit };
}

function eaddrinuse() {
  return Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" });
}

describe("handleListenError", () => {
  it("EADDRINUSE のときポート番号入りのメッセージを出して exit(1) する", () => {
    const { err, exit } = stub();

    expect(() => handleListenError(eaddrinuse(), 5174)).toThrow(ExitCalled);

    expect(err).toHaveBeenCalledWith(
      "ポート 5174 は使用中です。既存の cinch が起動していないか確認してください。",
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("渡されたポート番号をそのままメッセージに使う", () => {
    const { err } = stub();

    expect(() => handleListenError(eaddrinuse(), 3000)).toThrow(ExitCalled);

    expect(err).toHaveBeenCalledWith(
      "ポート 3000 は使用中です。既存の cinch が起動していないか確認してください。",
    );
  });

  it("EADDRINUSE 以外のエラーはそのまま throw する（console.error も exit も呼ばない）", () => {
    const { err, exit } = stub();
    const other = Object.assign(new Error("listen EACCES"), { code: "EACCES" });

    expect(() => handleListenError(other, 5174)).toThrow(other);
    expect(err).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });
});
