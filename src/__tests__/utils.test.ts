import { isValidDate, stripTsNoise } from "../utils";

describe("stripTsNoise", () => {
  it("should skip noise props", () => {
    expect(
      stripTsNoise({
        a: 1,
        statements: ["a"],
        b: {
          a: 4,
          checker: { getOne: () => 1 },
          parent: null,
        },
        r: [
          {
            a: 8,
            parent: 2,
          },
        ],
        parent: {
          a: 3,
          b: {
            a: 5,
            checker: { getOne: () => 1 },
            parent: {
              a: 6,
              parent: null,
            },
          },
        },
      })
    ).toEqual({
      a: 1,
      b: {
        a: 4,
      },
      r: [
        {
          a: 8,
        },
      ],
    });
  });

  it("should skip already mapped", () => {
    const v = {
      s: 1,
    };
    const i = {
      d: 6,
    };
    const o = {
      a: 1,
      v,
      r: [i],
      b: {
        a: 4,
        r: [],
        v,
      },
    };
    expect(stripTsNoise(o)).toEqual({
      a: 1,
      v: { s: 1 },
      r: [{ d: 6 }],
      b: {
        a: 4,
        r: [],
      },
    });
  });

  it("should skip too deep nesting", () => {
    type Node = {
      i?: number | string;
      child?: Node | string;
    };

    function buildTree(maxLevel: number): [Node, Node] {
      const root: Node = {
        i: 0,
      };
      let last = root;
      for (let i = 1; i <= maxLevel; i++) {
        last.child = {
          i,
          child: {},
        };
        last = last.child;
      }
      return [root, last];
    }

    const [input] = buildTree(30);
    const [expected, innermost] = buildTree(15);
    innermost.i = "[MAX_CALL_LEVEL]";
    innermost.child = "[MAX_CALL_LEVEL]";
    const actual = stripTsNoise(input);
    expect(actual).toEqual(expected);
  });

  it("should not map if not changed", () => {
    const o = {
      a: 1,
      b: {
        a: 4,
        r: [{ s: 6 }],
      },
    };
    expect(stripTsNoise(o)).toBe(o);
  });
});

describe("isValidDate", () => {
  it.each([null, undefined, "", "wat", new Date(NaN), -123456])(
    "should return false for %s",
    (v) => {
      expect(isValidDate(v)).toBeFalsy();
    }
  );

  it.each([
    new Date(),
    new Date().getTime(),
    new Date().toISOString(),
    "2022-12-06",
  ])("should return true for %s", (v) => {
    expect(isValidDate(v)).toBeTruthy();
  });
});
