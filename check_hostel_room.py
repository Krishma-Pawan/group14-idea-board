import ucsc_student_portal_official_api as ucsc_api

def check_hostel_room(index_number, password):
    try:
        # Initialize the portal session
        portal = ucsc_api.StudentPortal()
        
        # Authenticate using student credentials
        print(f"Authenticating student {index_number}...")
        login_success = portal.login(username=index_number, password=password)
        
        if not login_success:
            print("Login failed. Please check your credentials.")
            return

        # Fetch student profile/hostel information
        # Assuming the API has a dedicated method for hostel details
        hostel_info = portal.get_hostel_details()
        
        if hostel_info:
            room_number = hostel_info.get('room_number', 'Not Assigned')
            hostel_name = hostel_info.get('hostel_name', 'Unknown')
            
            print("-" * 30)
            print(f"Hostel Name: {hostel_name}")
            print(f"Room Number: {room_number}")
            print("-" * 30)
        else:
            print("Hostel information not found for this student.")
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    # Replace with your actual UCSC Index Number and Portal Password
    MY_INDEX = "2200XXXX" 
    MY_PASSWORD = "your_password_here"
    
    check_hostel_room(MY_INDEX, MY_PASSWORD)
