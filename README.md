# SaludIA Medical Triage Application

## Overview
SaludIA is a web-based medical triage system designed to assist healthcare professionals in classifying patients based on their symptoms and urgency levels. The application aims to streamline the triage process, making it easier for medical staff to provide timely care.

## Project Structure
The project is organized into the following directories and files:

http://3.86.176.124/

```
saludia-medical-triage-app
├── public
│   ├── index.html          # Main page with a login button
│   ├── login.html          # Login page for user authentication
│   └── classify.html       # Patient classification page
├── src
│   ├── assets              # Directory for images and other assets
│   ├── styles
│   │   ├── main.css        # Main styles for the application
│   │   ├── login.css       # Styles specific to the login page
│   │   └── classify.css     # Styles specific to the classification page
│   ├── scripts
│   │   ├── main.js         # Main JavaScript logic
│   │   ├── login.js        # JavaScript for the login page
│   │   └── classify.js      # JavaScript for the classification page
│   └── ai
│       └── engine.js       # Future AI integration for triage procedures
├── package.json            # npm configuration file
├── README.md               # Project documentation
└── .gitignore              # Files to be ignored by version control
```

## Setup Instructions
1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd saludia-medical-triage-app
   ```

2. **Install Dependencies**
   Ensure you have Node.js installed, then run:
   ```bash
   npm install
   ```

3. **Run the Application**
   You can use a local server to run the application. For example, you can use `live-server` or any other server of your choice:
   ```bash
   npx live-server public
   ```

4. **Access the Application**
   Open your web browser and navigate to `http://localhost:8080` (or the port specified by your server) to access the application.

## Future Enhancements
- Integration of an artificial intelligence engine for advanced triage procedures.
- Additional features for user management and patient history tracking.

## Contributing
Contributions are welcome! Please submit a pull request or open an issue for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for more details.
