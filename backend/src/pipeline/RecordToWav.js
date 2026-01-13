class RecordToWav extends TransformStream {
  constructor(options) {
    super(options)
    this.file = options.file
  }

  transform(chunk, controller) {
    controller.enqueue(chunk)
  }
}

module.exports = RecordToWav