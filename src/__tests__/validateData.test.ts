import { errorKindSeverity, validateData } from "../validateData";
import { expectDeepContaining } from "../../../ag-grid-multi-levels/src/utils/test-utils";
import { TypeInfo, ValidationError, ValidationResult } from "../types";
import { findTypeInfo } from "./test-utils";

describe("validateData", () => {
  const isoDate = "2023-05-12T10:07:28.417Z";
  const date = new Date(isoDate);

  describe("when validating js types", () => {
    it.each`
      value                      | expectedType  | errorType
      ${1}                       | ${"number"}   | ${undefined}
      ${"wat"}                   | ${"string"}   | ${undefined}
      ${date}                    | ${"Date"}     | ${undefined}
      ${isoDate}                 | ${"Date"}     | ${"stringToDate"}
      ${true}                    | ${"boolean"}  | ${undefined}
      ${"(a+)"}                  | ${"RegExp"}   | ${"stringToRegExp"}
      ${/(a+)/}                  | ${"RegExp"}   | ${undefined}
      ${["one", "two", "three"]} | ${"string[]"} | ${undefined}
      ${[1, 2, 3]}               | ${"number[]"} | ${undefined}
    `(
      "should pass for $value to be a $expectedType",
      ({ value, expectedType, errorType }) => {
        const actual = validateData(value, [], expectedType);
        if (errorType) {
          expect(actual).toMatchObject<ValidationResult>({
            errors: [expect.objectContaining({ errorType })],
          });
          expect(errorKindSeverity[errorType]).toEqual("hint");
        } else {
          expect(actual).toEqual({});
        }
      }
    );
    /*
     */
    it.each`
      value            | expectedType  | message                                                  | errorType
      ${1}             | ${"string"}   | ${"A string value expected, encountered number"}         | ${"typeMismatch"}
      ${"wat"}         | ${"number"}   | ${"A number value expected, encountered string"}         | ${"typeMismatch"}
      ${new Date(NaN)} | ${"Date"}     | ${"A Date value expected, encountered Invalid Date"}     | ${"typeMismatch"}
      ${"wat"}         | ${"Date"}     | ${"A Date value expected, encountered wat"}              | ${"typeMismatch"}
      ${1}             | ${"boolean"}  | ${"A boolean value expected, encountered number"}        | ${"typeMismatch"}
      ${1}             | ${"RegExp"}   | ${"A RegExp value expected, encountered number"}         | ${"typeMismatch"}
      ${[1, 2, 3]}     | ${"number"}   | ${"A scalar number expected, encountered an array"}      | ${"objectExpected"}
      ${1}             | ${"number[]"} | ${"Array of number expected, encountered scalar number"} | ${"arrayExpected"}
    `(
      "should fail when $value is expected to be a $expectedType",
      ({ value, expectedType, message, errorType }) => {
        expect(validateData(value, [], expectedType)).toEqual({
          errors: [
            expectDeepContaining<ValidationError>({
              value,
              typeInfo: {
                typeName: expectedType,
              },
              path: [],
              errorType,
              message,
            }),
          ],
        });
      }
    );
  });

  describe("when validating union types", () => {
    it.each`
      prop                | typeNames                       | isArray  | isNullable
      ${"boo"}            | ${["number", "string", "Date"]} | ${false} | ${false}
      ${["one", 2, date]} | ${["number", "string", "Date"]} | ${true}  | ${true}
      ${null}             | ${["number", "string", "Date"]} | ${false} | ${true}
    `(
      "should pass for $prop to be a $typeName",
      ({ prop, typeNames, isArray, isNullable }) => {
        let typeInfo: TypeInfo = {
          typeName: typeNames.join(" | "),
          unionOf: typeNames.map((tn) => ({
            typeName: tn,
          })),
        };
        if (isArray) {
          typeInfo = {
            typeName: `(${typeInfo.typeName})[]`,
            arrayOf: typeInfo,
          };
        }
        if (isNullable) {
          typeInfo.isNullable = true;
        }

        expect(
          validateData(
            {
              prop,
            },
            [
              {
                name: "Test",
                typeName: "Test",
                properties: [
                  {
                    name: "prop",
                    isOptional: false,
                    type: typeInfo,
                  },
                ],
              },
            ],
            "Test"
          )
        ).toEqual({});
      }
    );
  });

  describe("when validating hierarchical objects", () => {
    let schema: TypeInfo[];

    beforeEach(() => {
      const size: TypeInfo = {
        typeName: "Size",
        allowedValues: ["small", "medium", "large"],
      };
      schema = [
        size,
        {
          typeName: "Buyer",
          properties: [
            {
              name: "company",
              type: { typeName: "string" },
            },
            {
              name: "size",
              isOptional: true,
              type: size,
            },
          ],
        },
        {
          typeName: "Volunteer",
          properties: [
            {
              name: "fund",
              type: { typeName: "string" },
            },
          ],
        },
      ];

      schema.push({
        name: "Counterpart",
        typeName: "Buyer | Volunteer",
        unionOf: [
          findTypeInfo(schema, "Buyer"),
          findTypeInfo(schema, "Volunteer"),
        ],
      });

      schema.push({
        name: "Deal",
        typeName: "Deal",
        properties: [
          {
            name: "counterparts",
            type: {
              typeName: "Counterpart[]",
              arrayOf: findTypeInfo(schema, "Counterpart"),
            },
          },
        ],
      });
    });

    it("should pass union object property", () => {
      const deal = {
        counterparts: [{ company: "BMQ" }, { fund: "fmg" }],
      };
      expect(validateData(deal, schema, "Deal")).toEqual({});
    });

    it("should fail on wrong allowed value", () => {
      const buyer = {
        company: "BMG",
        size: "alarma",
      };
      expect(validateData(buyer, schema, "Buyer")).toEqual({});
    });
  });
});
