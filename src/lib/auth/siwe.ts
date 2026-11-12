/**
 * Minimal EIP-4361 (Sign-In with Ethereum) message construction and parsing.
 *
 * The server builds the message and the client signs exactly that string, so there is no need to
 * accept arbitrary SIWE from the wire. Parsing still validates every field, because the signature
 * covers the text and a mismatch between the text and the stored nonce is the attack we care
 * about.
 */

export type SiweFields = {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
};

const ADDRESS_LINE = /^0x[a-fA-F0-9]{40}$/;

export function buildSiweMessage(input: SiweFields): string {
  return [
    `${input.domain} wants you to sign in with your Ethereum account:`,
    input.address,
    "",
    input.statement,
    "",
    `URI: ${input.uri}`,
    "Version: 1",
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expiration Time: ${input.expirationTime}`,
  ].join("\n");
}

export function parseSiweMessage(message: string): SiweFields | null {
  const lines = message.split("\n");
  if (lines.length < 8) return null;

  const header = lines[0] ?? "";
  const suffix = " wants you to sign in with your Ethereum account:";
  if (!header.endsWith(suffix)) return null;
  const domain = header.slice(0, -suffix.length).trim();

  const address = (lines[1] ?? "").trim();
  if (!ADDRESS_LINE.test(address)) return null;

  const fields: Record<string, string> = {};
  for (const line of lines.slice(2)) {
    const match = /^(URI|Version|Chain ID|Nonce|Issued At|Expiration Time): (.*)$/.exec(line);
    if (match) fields[match[1]] = match[2];
  }

  // The statement is everything between the address and the blank line before URI.
  const uriIndex = lines.findIndex((line) => line.startsWith("URI: "));
  const statement = lines
    .slice(3, uriIndex > 0 ? uriIndex : 0)
    .join("\n")
    .trim();

  const chainId = Number(fields["Chain ID"]);
  if (
    !domain ||
    !fields.URI ||
    fields.Version !== "1" ||
    !Number.isInteger(chainId) ||
    !fields.Nonce ||
    !fields["Issued At"] ||
    !fields["Expiration Time"]
  ) {
    return null;
  }

  return {
    domain,
    address,
    statement,
    uri: fields.URI,
    chainId,
    nonce: fields.Nonce,
    issuedAt: fields["Issued At"],
    expirationTime: fields["Expiration Time"],
  };
}

/** Constant-time-ish comparison is unnecessary for public values, but normalise case. */
export function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
