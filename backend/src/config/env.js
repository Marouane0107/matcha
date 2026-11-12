export function assertDevOrTest(label = 'This operation') {
  const env = (process.env.NODE_ENV || '').trim().toLowerCase();
  if (env !== 'development' && env !== 'test') {
    throw new Error(
      `${label} is restricted to development/test environments and refused to run. ` +
        `NODE_ENV is currently "${process.env.NODE_ENV || '(unset)'}". ` +
        `Set NODE_ENV=development (or test) and retry.`
    );
  }
}
