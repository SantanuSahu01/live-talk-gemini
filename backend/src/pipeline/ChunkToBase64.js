class ChunkToBase64 extends TransformStream {
  constructor(options) {
    super(options)
  }

  transform(chunk, controller) {
    const base64 = chunk.toString('base64')
    controller.enqueue(base64)
  }
}

module.exports = ChunkToBase64