class Base64ToChunk extends TransformStream {
  constructor(options) {
    super(options)
  }

  transform(chunk, controller) {
    const base64 = chunk.toString('base64')
    const chunk = base64.split('').map(char => char.charCodeAt(0))
    controller.enqueue(chunk)
  }
}

module.exports = Base64ToChunk