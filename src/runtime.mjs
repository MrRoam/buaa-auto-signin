export function assertSupportedNode(minimumMajor = 18) {
  const major = Number(process.versions.node.split(".", 1)[0]);
  if (!Number.isInteger(major) || major < minimumMajor) {
    throw new Error(`需要 Node.js ${minimumMajor} 或更高版本，当前版本是 ${process.versions.node}。`);
  }
}

