const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');
const { toPublicUser } = require('../utils/mappers');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// @desc    Register user
// @route   POST /api/auth/signup
// @access  Public
const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const { data: existingUser, error: existingError } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { data: user, error: createError } = await supabase
      .from('users')
      .insert({
        name: name.trim(),
        email: normalizedEmail,
        password_hash: passwordHash,
      })
      .select('*')
      .single();

    if (createError) throw createError;

    const token = generateToken(user.id);

    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
      user: toPublicUser(user),
    });
  } catch (error) {
    console.error('Signup error:', error);
    if (error && error.code === '42501') {
      return res.status(500).json({
        success: false,
        message:
          'Database permission denied during registration. Verify SUPABASE_SERVICE_ROLE_KEY or disable RLS for public.users.',
      });
    }
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (userError) throw userError;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Contact the administrator.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const nowIso = new Date().toISOString();
    await supabase.from('users').update({ last_login: nowIso }).eq('id', user.id);

    const token = generateToken(user.id);

    res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: toPublicUser({ ...user, last_login: nowIso }),
    });
  } catch (error) {
    console.error('Login error:', error);
    if (error && error.code === '42501') {
      return res.status(500).json({
        success: false,
        message:
          'Database permission denied during login. Verify SUPABASE_SERVICE_ROLE_KEY or disable RLS for public.users.',
      });
    }
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user._id)
      .maybeSingle();

    if (error) throw error;
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    res.json({
      success: true,
      user: toPublicUser(user),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = { signup, login, getMe };
