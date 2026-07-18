import { OrchestraShell } from "~/components/landscape/OrchestraShell";
import { api, HydrateClient } from "~/trpc/server";

export default async function Home() {
  const registry = await api.registry.list();

  return (
    <HydrateClient>
      <OrchestraShell registry={registry} />
    </HydrateClient>
  );
}
