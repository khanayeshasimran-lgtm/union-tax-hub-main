
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface RateLimitConfig {
  action: string;
  maxAttempts: number;
  windowSeconds: number;
  message?: string;
}

export function useRateLimit() {
  const { toast } = useToast();

  const check = async (userId: string, config: RateLimitConfig): Promise<boolean> => {
    const identifier = `user:${userId}:${config.action}`;
    const { data, error } = await (supabase as any).rpc("check_rate_limit", {
      p_identifier: identifier,
      p_action: config.action,
      p_max_attempts: config.maxAttempts,
      p_window_seconds: config.windowSeconds,
    });
    if (error) { console.error("[RateLimit] Error:", error.message); return true; }
    if (!data) {
      toast({ title: "Too many attempts", description: config.message || "Please wait before trying again.", variant: "destructive" });
      return false;
    }
    return true;
  };

  return { check };
}

export const RATE_LIMITS = {
  disposition:       { action: "log_disposition",   maxAttempts: 30, windowSeconds: 3600, message: "Too many dispositions logged. Please wait." },
  csvImport:         { action: "csv_import",         maxAttempts: 5,  windowSeconds: 3600, message: "Too many imports. Please wait an hour." },
  leadCreate:        { action: "lead_create",        maxAttempts: 50, windowSeconds: 3600, message: "Too many leads created. Please wait." },
  estimationCreate:  { action: "estimation_create",  maxAttempts: 20, windowSeconds: 3600, message: "Too many estimations created. Please wait." },
  revenueLog:        { action: "revenue_log",        maxAttempts: 20, windowSeconds: 3600, message: "Too many payments logged. Please wait." },
};