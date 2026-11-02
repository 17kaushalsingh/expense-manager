import Decimal from "decimal.js";
/** Deliberately small arithmetic grammar; no eval, variables, functions, or exponents. */
export function calculateAmount(expression: string): string {
  const normalized=expression.replaceAll("×","*").replaceAll("÷","/").replaceAll("−","-");
  if(normalized.includes(",")&&normalized.includes("."))throw Error("Use one decimal separator and no thousands separators.");
  const input = normalized.replaceAll(",",".").replace(/\s/g, "");
  if (!input || input.length > 200)
    throw Error("Enter an amount or calculation.");
  const tokens = input.match(/\d+(?:\.\d*)?|\.\d+|[()+\-*/]/g) ?? [];
  if (tokens.join("") !== input) throw Error("Use numbers and + − × ÷ only.");
  let i = 0,
    depth = 0;
  function atom(): Decimal {
    if (++depth > 32) throw Error("Calculation is too long.");
    let value: Decimal;
    const token = tokens[i++];
    if (token === "(") {
      value = sum();
      if (tokens[i++] !== ")") throw Error("Close the brackets.");
    } else if (token === "+" || token === "-") {
      value = atom();
      if (token === "-") value = value.neg();
    } else {
      if (!token || !/^\d|^\./.test(token))
        throw Error("Complete the calculation.");
      value = new Decimal(token);
    }
    depth--;
    return value;
  }
  function product(): Decimal {
    let value = atom();
    while (tokens[i] === "*" || tokens[i] === "/") {
      const op = tokens[i++],
        right = atom();
      if (op === "/" && right.isZero()) throw Error("Cannot divide by zero.");
      value = op === "*" ? value.mul(right) : value.div(right);
    }
    return value;
  }
  function sum(): Decimal {
    let value = product();
    while (tokens[i] === "+" || tokens[i] === "-") {
      const op = tokens[i++],
        right = product();
      value = op === "+" ? value.plus(right) : value.minus(right);
    }
    return value;
  }
  const result = sum().toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (i !== tokens.length) throw Error("Check the calculation.");
  if (!result.isFinite() || result.lte(0) || result.gte(1000000000000))
    throw Error("Use a positive amount below one trillion.");
  return result.toFixed(2);
}
