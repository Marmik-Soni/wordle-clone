import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Wordle Clone API",
      version: "1.0.0",
      description: "API documentation for the Wordle Clone backend",
    },
    servers: [
      {
        url: "http://localhost:5000",
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        UserStats: {
          type: "object",
          properties: {
            gamesPlayed: { type: "number" },
            gamesWon: { type: "number" },
            currentStreak: { type: "number" },
            maxStreak: { type: "number" },
            lastPlayedDate: { type: "string", nullable: true },
            guessDistribution: {
              type: "object",
              properties: {
                1: { type: "number" },
                2: { type: "number" },
                3: { type: "number" },
                4: { type: "number" },
                5: { type: "number" },
                6: { type: "number" },
              },
            },
          },
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
            stats: { $ref: "#/components/schemas/UserStats" },
          },
        },
        AuthResponse: {
          type: "object",
          properties: {
            accessToken: { type: "string" },
            refreshToken: { type: "string" },
            user: { $ref: "#/components/schemas/User" },
          },
        },
        GuessResult: {
          type: "object",
          properties: {
            guess: { type: "string" },
            colors: {
              type: "array",
              items: {
                type: "string",
                enum: ["green", "yellow", "gray"],
              },
            },
          },
        },
        GameSession: {
          type: "object",
          properties: {
            sessionId: { type: "string" },
            date: { type: "string" },
            wordNumber: { type: "number" },
            guesses: {
              type: "array",
              items: { $ref: "#/components/schemas/GuessResult" },
            },
            completed: { type: "boolean" },
            won: { type: "boolean" },
            remainingGuesses: { type: "number" },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
