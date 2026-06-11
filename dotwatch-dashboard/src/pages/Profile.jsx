import React from 'react'
import { auth } from '../services/firebase'

function Profile() {
  const user = auth.currentUser

  return (
    <div className="page">
      <section className="panel">
        <div className="section-title">
          <h2>Profile</h2>
          <p>ข้อมูลบัญชีผู้ใช้งาน</p>
        </div>

        <div className="profile-card">
          <div className="profile-avatar">
            {user?.email?.charAt(0).toUpperCase() || 'U'}
          </div>

          <div className="profile-info">
            <h3>{user?.displayName || 'dotWatch User'}</h3>
            <p>{user?.email}</p>
            <small>User ID: {user?.uid}</small>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Profile