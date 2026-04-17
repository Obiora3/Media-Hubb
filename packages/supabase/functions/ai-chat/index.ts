/**
 * Supabase Edge Function — ai-chat
 *
 * Proxies requests to the Anthropic API so the API key never
 * touches the browser.
 *
 * Deploy:
 *   supabase functions deploy ai-chat
 *
 * Set secret:
 *   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 *
 * Call from the app:
 *   const { data, error } = await supabase.functions.invoke("ai-chat", {
 *     body: { prompt, systemPrompt },
 *   });
 */

import Anthropic from "npm:@anthropic-ai/sdk@0.24.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { prompt, systemPrompt } = await req.json() as {
      prompt: string;
      systemPrompt: string;
    };

    if (!prompt || !systemPrompt) {
      return new Response(
        JSON.stringify({ error: "prompt and systemPrompt are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const client = new Anthropic();   // reads ANTHROPIC_API_KEY from Deno env

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("")
      .trim();

    return new Response(
      JSON.stringify({ content: text }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
