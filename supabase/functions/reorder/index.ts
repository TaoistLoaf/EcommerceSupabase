import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createReorderHandler } from "./handler.js";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

serve(
  createReorderHandler({
    authenticate: async (authorization) => {
      const client = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
      });
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;
      return { user: data.user, client };
    },
    reorder: async ({ client, orderNumber }) => {
      const { data, error } = await client.rpc("reorder_order_into_cart", {
        p_order_number: orderNumber,
      });
      if (error) throw error;
      return data;
    },
  })
);
