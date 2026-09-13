import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

const State = Annotation.Root({
  value: Annotation(),
});

export async function main() {
  const graph = new StateGraph(State)
    .addNode("reject", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error("LANGGRAPH_NODE_REJECT_EXPECTED");
    })
    .addEdge(START, "reject")
    .addEdge("reject", END)
    .compile();

  await graph.invoke({ value: 1 });
  console.log("LANGGRAPH_NODE_REJECT_SHOULD_NOT_RUN");
}
