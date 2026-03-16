import { useAuth } from "@/hooks/useAuth";

export function useUserRole() {
  const { session, loading } = useAuth();
  
  const role = session?.user?.app_metadata?.role as string | undefined;
  const isAdmin = role === "admin";
  
  return { role, isAdmin, loading };
}
