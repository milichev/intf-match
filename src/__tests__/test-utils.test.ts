import { expectDeepContaining } from "./test-utils";

describe("expectDeepContaining", () => {
  type Obj = {
    id: number;
    name: string;
    roles: ReadonlyArray<{
      title: string;
      enabled: boolean;
      permissions: ReadonlyArray<{
        name: string;
        entities: string[];
      }>;
    }>;
  };

  const actual = {
    id: 1,
    name: "Woe",
    roles: [
      {
        title: "master",
        enabled: false,
        permissions: [
          {
            name: "spunk",
            entities: ["jambe"],
          },
          {
            name: "fly",
            entities: ["wings", "air"],
          },
        ],
      },
      {
        title: "puppet",
        enabled: true,
        permissions: [
          {
            name: "obey",
            entities: ["self", "their"],
          },
          {
            name: "have fun",
            entities: ["yo", "there"],
          },
        ],
      },
    ],
  };

  it("should match expectation", () => {
    const expectation = expectDeepContaining<Obj>({
      name: "Woe",
      roles: [
        {
          title: "puppet",
          permissions: [
            {
              name: "have fun",
              entities: ["there"],
            },
          ],
        },
      ],
    });

    expect(actual satisfies Obj).toEqual(expectation);
  });

  it("should not match deep expectation", () => {
    const expectation = expectDeepContaining<Obj>({
      name: "Woe",
      roles: [
        {
          title: "puppet",
          permissions: [
            {
              name: "have fun",
              entities: ["anything"],
            },
          ],
        },
      ],
    });

    expect(actual satisfies Obj).not.toEqual(expectation);
  });
});
