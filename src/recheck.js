let throttlingExceptionCounter = 0;

export function getRecheckInterval() {
  if (throttlingExceptionCounter === 10) {
    throw new Error('Maximum throttling backoff exceeded');
  } else {
    return (2 ** throttlingExceptionCounter * 10000);
  }
}

export function checkForThrottlingException(exception) {
  return (exception && (exception.code === 'Throttling') && (exception.message === 'Rate exceeded'));
}

export function handleThrottlingException() {
  throttlingExceptionCounter++;
  console.log(`Setting new re-check interval to ${getRecheckInterval()}ms`);
}
