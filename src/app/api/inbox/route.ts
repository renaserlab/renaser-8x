import { protegido, ok } from "@/lib/api";
import { bandeja } from "@/lib/bandeja";

export const GET = protegido({ consultor: true }, async () => ok(await bandeja()));
