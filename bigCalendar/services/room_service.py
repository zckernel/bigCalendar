from bigCalendar.repositories import room_repository


def get_all_rooms():
    return room_repository.get_all()
