import React, { useState } from 'react';
import './ContactForm.css';
import emailjs from 'emailjs-com';

const ContactForm = ({ onClose }) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    message: ''
  });
  const [showSuccessMessage, setShowSuccessMessage] = useState(false); // State to show success message

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    emailjs.send(
      'service_q9hrmhk', // Replace with your EmailJS service ID
      'template_w0x7dmk', // Replace with your EmailJS template ID
      formData,
      'YOUR_USER_ID' // Replace with your EmailJS user ID
    )
    .then((response) => {
      console.log('Message sent successfully!', response);
      setShowSuccessMessage(true); // Show success message

      setTimeout(() => {
        setShowSuccessMessage(false);
        onClose(); // Close the form after showing the success message
      }, 3000); // Display the success message for 3 seconds
    })
    .catch((error) => {
      console.error('Failed to send message.', error);
    });
  };

  return (
    <div className="contact-form-overlay">
      <div className="contact-form-container">
        <button className="close-button" onClick={onClose}>X</button>
        <h2>Contact Form</h2>
        <p>Please let me know what you think!</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="firstName">Full Name *</label>
            <div className="name-inputs">
              <input type="text" id="firstName" name="firstName" placeholder="First Name" value={formData.firstName} onChange={handleChange} required />
              <input type="text" id="lastName" name="lastName" placeholder="Last Name" value={formData.lastName} onChange={handleChange} />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="email">E-mail *</label>
            <input type="email" id="email" name="email" placeholder="example@example.com" value={formData.email} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label htmlFor="message">Message *</label>
            <textarea id="message" name="message" value={formData.message} onChange={handleChange} required />
          </div>
          <button type="submit" className="submit-button">Submit</button>
        </form>
        {showSuccessMessage && (
          <div className="success-message">
            Your message has been sent successfully! Thank you.
          </div>
        )}
      </div>
    </div>
  );
};

export default ContactForm;
