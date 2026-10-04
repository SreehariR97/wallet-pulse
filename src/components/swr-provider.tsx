"use client";
import { SWRConfig } from "swr";
import { swrFetcher, ApiError } from "@/lib/api-client";

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        // Keep showing the previous result while a new filter/page loads,
        // instead of flashing back to skeletons.
        keepPreviousData: true,
        // 4xx won't fix itself on retry; 5xx and network errors might.
        onErrorRetry: (err, _key, _config, revalidate, { retryCount }) => {
          if (err instanceof ApiError && err.status < 500) return;
          if (retryCount >= 3) return;
          setTimeout(() => revalidate({ retryCount }), 2000 * 2 ** retryCount);
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
