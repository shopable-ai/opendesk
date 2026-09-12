import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

const State = Annotation.Root({
  value: Annotation(),
  trace: Annotation(),
});

export async function main() {
  const graph = new StateGraph(State)
    .addNode("add", async (state) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        value: state.value + 2,
        trace: [...state.trace, "add"],
      };
    })
    .addNode("multiply", (state) => ({
      value: state.value * 4,
      trace: [...state.trace, "multiply"],
    }))
    .addEdge(START, "add")
    .addEdge("add", "multiply")
    .addEdge("multiply", END)
    .compile();

  const result = await graph.invoke({
    value: 3,
    trace: [],
  });

  if (result.value !== 20 || result.trace.join(",") !== "add,multiply") {
    throw new Error(`LANGGRAPH_DEMO_FAILED ${JSON.stringify(result)}`);
  }

  console.log(`LANGGRAPH_DEMO_OK ${JSON.stringify(result)}`);
  return result;
}
