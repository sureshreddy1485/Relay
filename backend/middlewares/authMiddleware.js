const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token provided');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password -securityKey');
    if (!req.user) {
      res.status(401);
      throw new Error('Not authorized, user not found');
    }

    if (decoded.sessionId) {
      const isValidSession = req.user.devices && req.user.devices.some(d => d.deviceId === decoded.sessionId);
      if (!isValidSession) {
        res.status(401);
        throw new Error('Session expired. You logged out from this device.');
      }
      req.user.currentSessionId = decoded.sessionId;
      
      // Update last active optionally
      // await User.updateOne(
      //   { _id: req.user._id, 'devices.deviceId': decoded.sessionId },
      //   { $set: { 'devices.$.lastActive': Date.now() } }
      // );
    }

    next();
  } catch (error) {
    res.status(401);
    throw new Error('Not authorized, token failed');
  }
});

module.exports = { protect };
