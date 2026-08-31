const runtime = {};
const common = File.read("tests/locateanything/scripts/common.js");
if (!common) {
  throw new Error("missing common runtime: tests/locateanything/scripts/common.js");
}
new Function("shared", common)(runtime);

const CONFIG = runtime.loadLocateAnythingConfig();
const IMAGE_PATH = CONFIG.defaultImagePath || "tests/locateanything/fixtures/wechat/mock_wechat.png";
const OUTPUT_PATH = ".runtime/tests/locateanything/mock_grounding_auto.png";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeRegionFromBox(box, id, label, confidence) {
  return {
    id,
    role: "grounded-box",
    label,
    confidence,
    bbox: {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.max(1, Math.round(box.width)),
      height: Math.max(1, Math.round(box.height)),
    },
  };
}

function makeRegionFromPoint(point, image, id, label, confidence) {
  const radius = 18;
  const x = clamp(Math.round(point.x - radius), 0, image.width - 1);
  const y = clamp(Math.round(point.y - radius), 0, image.height - 1);
  const width = Math.max(1, Math.min(radius * 2, image.width - x));
  const height = Math.max(1, Math.min(radius * 2, image.height - y));
  return {
    id,
    role: "grounded-point",
    label,
    confidence,
    bbox: { x, y, width, height },
  };
}

async function callBridge(task, phrase) {
  const response = await axios.post(`${CONFIG.serviceUrl}/v1/ground`, {
    ...(await runtime.buildBridgeImagePayload(IMAGE_PATH)),
    task,
    phrase,
    profile: "auto",
  }, {
    timeout: CONFIG.requestTimeoutMs,
  });
  return response.data;
}

async function main() {
  const health = await axios.get(`${CONFIG.serviceUrl}/health`, {
    timeout: CONFIG.requestTimeoutMs,
  });
  console.log("Bridge health:");
  console.log(JSON.stringify(health.data, null, 2));

  const requests = [
    { task: "gui_box", phrase: "the conversation list" },
    { task: "gui_point", phrase: "the send button" },
    { task: "gui_point", phrase: "the tiny unread badge" },
  ];

  const regions = [];

  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index];
    const result = await callBridge(request.task, request.phrase);
    console.log(`Result ${index + 1}:`);
    console.log(JSON.stringify(result, null, 2));

    result.boxes.forEach((box, boxIndex) => {
      regions.push(
        makeRegionFromBox(
          box,
          `box-${index + 1}-${boxIndex + 1}`,
          `${request.phrase} [${result.profile_used}]`,
          0.9
        )
      );
    });

    result.points.forEach((point, pointIndex) => {
      regions.push(
        makeRegionFromPoint(
          point,
          result.image,
          `point-${index + 1}-${pointIndex + 1}`,
          `${request.phrase} [${result.profile_used}]`,
          0.9
        )
      );
    });
  }

  const annotated = await Vision.annotateRegions({
    imagePath: IMAGE_PATH,
    regions,
    separators: [],
    outputPath: OUTPUT_PATH,
    title: "LocateAnything bridge demo",
  });

  console.log("Annotated output:");
  console.log(JSON.stringify(annotated, null, 2));
}

main().catch((error) => {
  console.error("LocateAnything demo failed:", error);
});
