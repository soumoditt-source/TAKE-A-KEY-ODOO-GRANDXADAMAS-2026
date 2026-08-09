import math

def calculate_haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates the great-circle distance between two spatial points on the Earth's surface in kilometers.
    This uses the Haversine formula to account for the spherical shape of the planet.
    """
    # The approximate radius of the Earth in kilometers.
    R = 6371.0 
    
    # Convert latitude and longitude differences from degrees to radians for trigonometric calculations.
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    
    # Apply the Haversine formula core logic to find the square of half the chord length between the points.
    a = (math.sin(dlat / 2) ** 2) + \
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * (math.sin(dlon / 2) ** 2)
    
    # Calculate the angular distance in radians using the arctangent function.
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    # Return the final geographical distance in kilometers by multiplying the angular distance by Earth's radius.
    return R * c

def detour_score(rider_orig: tuple, rider_dest: tuple, ride_orig: tuple, ride_dest: tuple) -> float:
    """
    Calculates the efficiency score (overhead) of a potential carpool match.
    A lower score indicates a more optimal match with less detour required by the driver.
    """
    # Calculate the extra distance the driver must travel from their origin to the passenger's pickup location.
    pickup_dist = calculate_haversine(rider_orig[0], rider_orig[1], ride_orig[0], ride_orig[1])
    
    # Calculate the extra distance the driver must travel from the passenger's drop-off location to their own destination.
    dropoff_dist = calculate_haversine(rider_dest[0], rider_dest[1], ride_dest[0], ride_dest[1])
    
    # The total detour score is the sum of both overhead distances.
    return pickup_dist + dropoff_dist
