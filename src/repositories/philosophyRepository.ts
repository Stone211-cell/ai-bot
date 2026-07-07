import type { Philosophy } from "../../generated/prisma/index.js";
import { prisma } from "../database/prismaClient.js";
import { withDbError } from "../utils/db.js";

export class PhilosophyRepository {
  async addPhilosophy(name: string, story: string, meaning: string): Promise<Philosophy> {
    return withDbError("Philosophy.addPhilosophy", { name }, () =>
      prisma.philosophy.create({
        data: { name, story, meaning },
      })
    );
  }

  async getLeastUsedPhilosophy(): Promise<Philosophy | null> {
    return withDbError("Philosophy.getLeastUsedPhilosophy", {}, async () => {
      const philo = await prisma.philosophy.findFirst({
        orderBy: [
          { usedCount: 'asc' },
          { createdAt: 'desc' }
        ]
      });

      if (philo) {
        // Increment the used count so it rotates
        await prisma.philosophy.update({
          where: { id: philo.id },
          data: { usedCount: { increment: 1 } }
        });
      }

      return philo;
    });
  }

  async getAll(): Promise<Philosophy[]> {
    return withDbError("Philosophy.getAll", {}, () =>
      prisma.philosophy.findMany({
        orderBy: { createdAt: 'desc' }
      })
    );
  }
}

export const philosophyRepository = new PhilosophyRepository();
