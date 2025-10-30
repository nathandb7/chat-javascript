const mongoose = require('mongoose');
const { Schema } = mongoose;

const ChatSchema = new Schema(
  {
    nick: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    msg: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false } // crea automáticamente created_at
  }
);

module.exports = mongoose.model('Chat', ChatSchema);
