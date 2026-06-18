export function createDeferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
