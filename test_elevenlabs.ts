import "dotenv/config";
import axios from "axios";

async function testElevenLabs() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";

  console.log("Testing ElevenLabs with API Key:", apiKey ? `${apiKey.substring(0, 8)}...` : "None");
  console.log("Using Voice ID:", voiceId);

  if (!apiKey) {
    console.error("Error: ELEVENLABS_API_KEY is not set in .env");
    return;
  }

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?optimize_streaming_latency=3`,
      {
        text: "สวัสดีครับ ยินดีที่ได้รู้จักครับ",
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        }
      },
      {
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json"
        },
        responseType: "json" // Request json info first to see if it is valid
      }
    );
    console.log("Success! Status:", response.status);
    console.log("Headers:", response.headers);
  } catch (error: any) {
    console.error("ElevenLabs request failed!");
    if (error.response) {
      console.error("Status:", error.response.status);
      try {
        // Read response body if possible
        if (typeof error.response.data.on === "function") {
          const body = await new Promise((resolve) => {
            let data = "";
            error.response.data.on("data", (chunk: any) => data += chunk.toString());
            error.response.data.on("end", () => resolve(data));
          });
          console.error("Response body (stream):", body);
        } else {
          console.error("Response body (JSON/Text):", JSON.stringify(error.response.data));
        }
      } catch (e) {
        console.error("Failed to parse body:", e);
      }
    } else {
      console.error("Error Message:", error.message);
    }
  }
}

testElevenLabs();
