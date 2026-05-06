// @desc    General user dashboard (any authenticated user)
// @route   GET /api/protected/dashboard
// @access  Any authenticated user
const generalDashboard = (req, res) => {
  res.json({
    success: true,
    message: `Welcome back, ${req.user.name}!`,
    data: {
      user: {
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        isSuperAdmin: req.user.isSuperAdmin,
        memberSince: req.user.createdAt,
      },
      announcements: [
        { id: 1, title: 'System Maintenance', body: 'Scheduled maintenance on Sunday 2–4 AM UTC.', date: new Date() },
        { id: 2, title: 'New Feature Release', body: 'DRBAC v2.0 is now live with dynamic role management.', date: new Date() },
      ],
    },
  });
};

module.exports = { generalDashboard };
