import { getDeps } from "@/src/server/deps";
import { createProject, listProjects } from "@/src/server/handlers/projects";

export const GET = (request: Request) => listProjects(request, getDeps());
export const POST = (request: Request) => createProject(request, getDeps());
