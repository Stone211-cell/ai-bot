import type { GlobalKnowledge } from "../../generated/prisma/index.js";
import { prisma } from "../database/prismaClient.js";
import { withDbError } from "../utils/db.js";

export class KnowledgeRepository {
  async addFact(topic: string, fact: string): Promise<GlobalKnowledge> {
    return withDbError("Knowledge.addFact", { topic }, () =>
      prisma.globalKnowledge.create({
        data: { topic, fact },
      })
    );
  }

  async getAllFacts(): Promise<GlobalKnowledge[]> {
    return withDbError("Knowledge.getAllFacts", {}, () =>
      prisma.globalKnowledge.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50 // Limit to avoid prompt explosion
      })
    );
  }
}

export const knowledgeRepository = new KnowledgeRepository();
