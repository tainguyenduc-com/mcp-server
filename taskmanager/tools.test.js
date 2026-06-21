import { runTest, assert, createRPCClient, setupServer } from "./test-setup.js";

export async function testTools() {
  const proc = await setupServer();
  const client = createRPCClient(proc);

  await runTest("List available tools", async () => {
    const response = await client.call("tools/list");
    assert(response?.result?.tools?.length > 0, "Should return tools list");
    const toolNames = response.result.tools.map(t => t.name);
    assert(toolNames.includes("task_create"), "Should include task_create");
    assert(toolNames.includes("task_claim"), "Should include task_claim");
    assert(toolNames.includes("task_update"), "Should include task_update");
    assert(toolNames.includes("task_list"), "Should include task_list");
    assert(toolNames.includes("task_get"), "Should include task_get");
    assert(toolNames.includes("task_pause"), "Should include task_pause");
    assert(toolNames.includes("task_fail"), "Should include task_fail");
    assert(toolNames.includes("task_cancel"), "Should include task_cancel");
    assert(toolNames.includes("task_find_available"), "Should include task_find_available");
    assert(toolNames.includes("task_report"), "Should include task_report");
  });

  proc.kill();
}
