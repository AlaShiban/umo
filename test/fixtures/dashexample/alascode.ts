import _ from "lodash"

export function myCode(input: string): string {
  const normalized = _.camelCase(input)
  return `${normalized} right Yo!!`
}